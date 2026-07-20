add_executable(25_blinn_phong main.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(25_blinn_phong glfw opengl32)
endif()

foreach(FILE_NAME blinn_phong.vs blinn_phong.fs)
    add_custom_command(TARGET 25_blinn_phong POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:25_blinn_phong>/${FILE_NAME}"
    )
endforeach()

add_custom_command(TARGET 25_blinn_phong POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
    "${CMAKE_SOURCE_DIR}/images/wall.jpg"
    "$<TARGET_FILE_DIR:25_blinn_phong>/wall.jpg"
)
