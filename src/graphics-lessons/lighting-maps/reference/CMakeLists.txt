add_executable(11_lighting_maps main.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(11_lighting_maps glfw opengl32)
endif()

foreach(FILE_NAME cube.vs cube.fs light.vs light.fs)
    add_custom_command(TARGET 11_lighting_maps POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:11_lighting_maps>/${FILE_NAME}"
    )
endforeach()

foreach(IMG_FILE container.png container_specular.png)
    add_custom_command(TARGET 11_lighting_maps POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_SOURCE_DIR}/images/${IMG_FILE}"
        "$<TARGET_FILE_DIR:11_lighting_maps>/${IMG_FILE}"
    )
endforeach()