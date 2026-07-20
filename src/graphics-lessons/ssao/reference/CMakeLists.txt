if(NOT TARGET assimp::assimp)
    message(FATAL_ERROR "34_SSAO requires Assimp. Check the vendored Assimp dependency under include/assimp.")
endif()

add_executable(34_SSAO main.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(34_SSAO glfw opengl32 assimp::assimp)
else()
    target_link_libraries(34_SSAO glfw assimp::assimp)
endif()

copy_assimp_runtime(34_SSAO)

foreach(FILE_NAME
    ssao.vs
    ssao.fs
    ssao_blur.fs
    ssao_geometry.vs
    ssao_geometry.fs
    ssao_lighting.fs
)
    add_custom_command(TARGET 34_SSAO POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:34_SSAO>/${FILE_NAME}"
    )
endforeach()

add_custom_command(TARGET 34_SSAO POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
    "${CMAKE_SOURCE_DIR}/model/backpack"
    "$<TARGET_FILE_DIR:34_SSAO>/model/backpack"
)
